import * as mqtt from 'mqtt';
import {Subject} from 'rxjs';
import {HomieDevice} from './homie-device';

export interface MqttMessage {
    topic: string;
    message: string;
    logLevel?: string;
    noRetain?: boolean;
}

export interface MqttServerConfig {
    brokerUrl: string;
    username: string;
    password: string;
}

export interface HomieMqttServerConfig extends MqttServerConfig {
    homeBaseTopic: string;
}

export interface SourceMqttServerConfig extends MqttServerConfig {
    baseTopics: Array<string>;
}

export interface OnMessageHandler {
    senderClient: mqtt.MqttClient;

    onMessage(baseTopic: string, topic: string, message: string): void;
}

export interface AdditionalConfiguration {
    initMessages?: Array<MqttMessage>;
    periodicalMessages?: Array<MqttMessage>;
    periodicalIntervalMs?: number;
}

export interface DeviceNode {
    nodeId: string;
    nodeName: string;
    nodeTopic?: string;
    device?: HomieDevice;
    properties: { [key: string]: NodeProperty },
    customProperties?: { [key: string]: NodeProperty },
    homieInitialized: boolean;
}

export interface HomieStats {
    interval: number;
    uptime: number;
    signal: number;
    voltage: number;
    battery: number;
    firstSeen: Date;
    lastSeen: Date;
}

export interface NodeProperty {
    type: 'float' | 'string' | 'enum' | 'boolean';
    value: number | string | boolean | undefined;
    format?: string;
    settable?: boolean;
    propertyTopic?: string;
    commandTopic?: string;
    homieSubscription?: boolean;
    noRetain?: boolean;
}

export interface HomieDeviceProperties {
    messagesToSend: Subject<MqttMessage>;
    requiredNodes: Array<string>;
    stats: HomieStats;
    nodes: Array<DeviceNode>;
    id: string;
    name: string;
    deviceTopic: string;
    currentState: 'init' | 'ready';
    mqttClient: mqtt.MqttClient;
}
