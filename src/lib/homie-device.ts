import {ReplaySubject, Subject, timer} from 'rxjs';
import * as mqtt from 'mqtt';
import {
    DeviceNode,
    HomieDeviceProperties,
    HomieMqttServerConfig,
    HomieStats,
    MqttMessage,
    NodeProperty
} from './interfaces';
import {myLogger} from '../logger';

export class HomieDevice implements HomieDeviceProperties {
    messagesToSend: Subject<MqttMessage>;
    requiredNodes: Array<string>;
    stats: HomieStats;
    nodes: Array<DeviceNode> = [];
    id: string;
    name: string;
    deviceTopic: string;
    currentState: HomieDeviceProperties['currentState'] = 'init';
    mqttClient: mqtt.MqttClient;
    ready = false;

    static create(deviceId: string, friendlyName: string, mqttConfig: HomieMqttServerConfig): HomieDevice {
        const subj = new ReplaySubject<MqttMessage>(1000, 5000);
        const stats: HomieStats = {
            firstSeen: new Date(),
            interval: 120,
            battery: 100,
            voltage: 0,
            lastSeen: new Date(),
            signal: 0,
            uptime: 0
        };
        const deviceTopic = `${mqttConfig.homieBaseTopic}/${deviceId}`;
        const client = mqtt.connect(mqttConfig.brokerUrl, {
            clientId: `General Purpose Mqtt To Homie writer for ${deviceId}`,
            keepalive: 60,
            password: mqttConfig.password,
            username: mqttConfig.username,
            resubscribe: true,
            reconnectPeriod: 2000,
            will: {topic: `${deviceTopic}/$state`, payload: 'lost', qos: 1, retain: true}
        });
        const homieDevice = new HomieDevice({
            id: deviceId,
            name: friendlyName ?? deviceId,
            nodes: [],
            messagesToSend: subj,
            stats: stats,
            currentState: 'init',
            deviceTopic: deviceTopic,
            requiredNodes: [],
            mqttClient: client
        });

        client.on('connect', () => {
            myLogger.info(`Connected for device ${deviceId}`);
            subj.subscribe(msg => {
                if (msg.logLevel === 'info') {
                    myLogger.info(`Sending to ${msg.topic}: ${msg.message} for ${deviceId}`);
                } else {
                    myLogger.silly(`Sending to ${msg.topic}: ${msg.message} for ${deviceId}`);
                }
                const opts: mqtt.IClientPublishOptions = {retain: !msg.noRetain, qos: 1};
                client.publish(msg.topic, msg.message.toString(), opts, (error => {
                    if (error) {
                        myLogger.error(`An error has occurred while sending a message to topic ${msg.topic}: ${error}`);
                    }
                }));
            });
        });
        homieDevice.sendHomieDeviceInfo();

        return homieDevice;
    }

    constructor(properties: HomieDeviceProperties) {
        Object.assign(this, properties);
        this.messagesToSend = properties.messagesToSend;
        this.requiredNodes = properties.requiredNodes;
        this.stats = properties.stats;
        this.nodes = properties.nodes;
        this.id = properties.id;
        this.name = properties.name;
        this.deviceTopic = properties.deviceTopic;
        this.mqttClient = properties.mqttClient;
    }

    changeDeviceState(
        desiredState: HomieDeviceProperties['currentState']
    ): void {
        this.messagesToSend.next({
            topic: `${this.deviceTopic}/$state`,
            message: desiredState,
        });
        this.currentState = desiredState;
    }

    updateNodes(): void {
        if (this.currentState !== 'init') {
            // When changing metadata, we need to go back to init
            this.changeDeviceState('init');
        }

        this.nodes.forEach(node => {
            const homieNodeTopic = node.nodeTopic;

            const properties = {...node.customProperties, ...node.properties};
            this.messagesToSend.next({
                topic: `${homieNodeTopic}/$name`,
                message: node.nodeName,
            });
            this.messagesToSend.next({
                topic: `${homieNodeTopic}/$type`,
                message: 'nodeType',
            });
            this.messagesToSend.next({
                topic: `${homieNodeTopic}/$properties`,
                message: Object.keys(properties).join(','),
            });

            Object.keys(properties).forEach(name => {
                const property = properties[name];
                const propertyTopic = property.propertyTopic;
                this.messagesToSend.next({
                    topic: `${propertyTopic}/$name`,
                    message: name,
                });
                this.messagesToSend.next({
                    topic: `${propertyTopic}/$datatype`,
                    message: property.type,
                });
                if (property.format) {
                    this.messagesToSend.next({
                        topic: `${propertyTopic}/$format`,
                        message: property.format,
                    });
                }
                if (property.settable) {
                    this.messagesToSend.next({
                        topic: `${propertyTopic}/$settable`,
                        message: 'true',
                    });
                    if (!property.homieSubscription) {
                        this.mqttClient.subscribe(
                            `${property.propertyTopic}/set`,
                            error => {
                                if (error) {
                                    myLogger.warn(
                                        `Could not subscribe to topic ${property.propertyTopic}/set`,
                                        error
                                    );
                                } else {
                                    property.homieSubscription = true;
                                }
                            }
                        );
                    }
                }
            });
        });

        const nodeNames = this.nodes.map(node => node.nodeId).join(',');
        this.messagesToSend.next({
            topic: `${this.deviceTopic}/$nodes`,
            message: nodeNames,
        });

        const requiredNodesAvailable =
            this.requiredNodes.length === 0 ||
            this.requiredNodes.every(required =>
                this.nodes.some(node => node.nodeId.startsWith(required))
            );

        if (this.currentState !== 'ready' && requiredNodesAvailable) {
            // There seems to be a bug in the Openhab Homie implementation
            // if a device becomes ready too fast after a config change
            const delay = 5000;
            setTimeout(() => this.changeDeviceState('ready'), delay);
            if (!this.ready) {
                this.ready = true;
                myLogger.info(
                    `Device ${this.id} will become ready in ${delay}ms`
                );
            }
        }
    }

    updateLastSeen(): void {
        this.stats.lastSeen = new Date();
    }

    sendNodePropertyValues(node: DeviceNode): void {
        const homieDevice = node.device;
        if (!homieDevice) {
            throw new Error('Node is not attached to device!');
        }
        homieDevice.updateLastSeen();
        if (!node.properties) {
            return;
        }
        Object.keys(node.properties).forEach(propertyName => {
            const property = node.properties[propertyName];
            this.updateStats(propertyName, property);
            if (property.value) {
                homieDevice.messagesToSend.next({
                    topic: `${property.propertyTopic}`,
                    message: property.value.toString(),
                    noRetain: property.noRetain,
                });
            }
        });
    }

    getNodeById(nodeId: string): DeviceNode | undefined {
        return this.nodes.find(n => n.nodeId === nodeId);
    }

    // findOrAddNode(
    //     nodeId: string,
    //     friendlyName: string,
    //     applyProperties: (node: DeviceNode) => Array<NodeProperty>,
    //     applyCustomProperties?: (node: DeviceNode) => Array<NodeProperty>
    // ): DeviceNode {
    //     let node = this.getNodeById(nodeId);
    //     if (!node) {
    //         node = {
    //             nodeId: nodeId,
    //             nodeTopic: `${this.deviceTopic}/${nodeId}`,
    //             device: this,
    //             nodeName: friendlyName ?? nodeId,
    //             homeInitialized: false,
    //             properties: [],
    //         };
    //         this.nodes.push(node);
    //     }
    //     if (applyProperties) {
    //         node.properties = applyProperties(node);
    //     }
    //     if (applyCustomProperties) {
    //         node.customProperties = applyCustomProperties(node);
    //     }
    //     if (
    //         !node.homeInitialized &&
    //         node.properties &&
    //         node.properties.length > 0
    //     ) {
    //         node.homeInitialized = true;
    //         this.sendNodePropertyValues(node);
    //         this.updateNodes();
    //     }
    //
    //     return node;
    // }

    init(): void {
        const subj = this.messagesToSend;
        const deviceTopic = this.deviceTopic;
        const stats = this.stats;
        this.currentState = 'init';
        this.sendHomieDeviceInfo();

        timer(0, stats.interval * 1000).subscribe(() => {
            myLogger.silly(`Updating Stats for ${this.id}`);
            const uptime = Math.floor(
                (new Date().getTime() - stats.firstSeen.getTime()) / 1000
            );

            const statsTopic = `${deviceTopic}/$stats`;
            subj.next({
                topic: `${statsTopic}`,
                message: 'uptime,signal,battery,voltage,firstSeen,lastSeen',
            });
            subj.next({
                topic: `${statsTopic}/interval`,
                message: stats.interval.toString(10),
            });
            subj.next({
                topic: `${statsTopic}/uptime`,
                message: uptime.toString(10),
            });
            subj.next({
                topic: `${statsTopic}/signal`,
                message: stats.signal.toString(10),
            });
            subj.next({
                topic: `${statsTopic}/voltage`,
                message: stats.voltage.toString(10),
            });
            subj.next({
                topic: `${statsTopic}/battery`,
                message: stats.battery.toString(10),
            });
            subj.next({
                topic: `${statsTopic}/firstSeen`,
                message: stats.firstSeen.toISOString(),
            });
            subj.next({
                topic: `${statsTopic}/lastSeen`,
                message: stats.lastSeen.toISOString(),
            });

            const lastSeenHours =
                (new Date().getTime() - stats.lastSeen.getTime()) /
                1000 /
                60 /
                60;
            if (lastSeenHours > 6) {
                subj.next({topic: `${deviceTopic}/$state`, message: 'lost'});
            }
        });
        myLogger.info(`Initializing device ${this.id}`);
    }

    resendHomieStructure(): void {
        this.changeDeviceState('init');
        this.sendHomieDeviceInfo();
        this.updateNodes();
        this.changeDeviceState('ready');
    }

    private sendHomieDeviceInfo(): void {
        const subj = this.messagesToSend;
        const deviceTopic = this.deviceTopic;
        subj.next({topic: `${deviceTopic}/$homie`, message: '3.0'});
        subj.next({topic: `${deviceTopic}/$name`, message: this.name});
        subj.next({
            topic: `${deviceTopic}/$state`, message: this.currentState,
        });
    }

    private updateStats(propertyName: string, property: NodeProperty): void {
        if (propertyName === 'battery') {
            this.stats.battery = <number>property.value;
        } else if (propertyName === 'linkquality') {
            this.stats.signal = <number>property.value;
        } else if (propertyName === 'voltage') {
            this.stats.voltage = <number>property.value;
        }
    }

    addNodes(...nodes: DeviceNode[]): void {
        nodes.forEach(node => {
            node.device = this;
            node.nodeTopic = `${this.deviceTopic}/${node.nodeId}`;
            Object.keys(node.properties).forEach(name => {
                node.properties[name] = new NodePropertyInternal(name, node.properties[name], node);
            })
            this.nodes.push(node);
        });
        this.updateNodes();
    }
}


export class NodePropertyInternal implements NodeProperty {
    commandTopic: string | undefined;
    format: string | undefined;
    homieSubscription: boolean;
    noRetain: boolean;
    propertyTopic: string;
    settable: boolean;
    type: 'float' | 'string' | 'enum' | 'boolean';
    private readonly node: DeviceNode;
    private readonly name: string;
    private valueInternal: number | string | boolean | undefined;

    set value(value: NodeProperty['value']) {
        myLogger.debug(`Updating value of property ${this.node.nodeId}/${this.name} to ${value}`);
        this.valueInternal = value;
        this.node.device?.messagesToSend.next({message: value?.toString() ?? '', topic: this.propertyTopic});
    }

    get value(): NodeProperty['value'] {
        return this.valueInternal;
    }

    constructor(name: string, nodeProperty: NodeProperty, node: DeviceNode) {
        this.name = name;
        this.node = node;
        this.commandTopic = nodeProperty.commandTopic;
        this.format = nodeProperty.format;
        this.homieSubscription = false;
        this.noRetain = !!nodeProperty.noRetain;
        this.propertyTopic = `${node.nodeTopic}/${name}`
        this.settable = !!nodeProperty.settable;
        this.type = nodeProperty.type;
        this.value = nodeProperty.value;
    }
}
