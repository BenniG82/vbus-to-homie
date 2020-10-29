import {Packet, SerialConnection, Specification} from 'resol-vbus';
import {myLogger} from '../logger';
import {DeviceNode, HomieMqttServerConfig} from './interfaces';
import {from, Subject, throwError} from 'rxjs';
import {catchError, throttleTime} from 'rxjs/operators';
import {HomieDevice} from './homie-device';

const pumpSpeedRelay1 = 'Pump speed relay 1';
const temperatureSensor1 = 'Temperature sensor 1';
const temperatureSensor2 = 'Temperature sensor 2';
const temperatureSensor3 = 'Temperature sensor 3';

export class VbusReader {
    readonly connection: SerialConnection;
    private readonly specification = Specification.getDefaultSpecification();
    private homieDevice: HomieDevice | undefined = undefined;
    private vbusInfos$$ = new Subject<VbusFieldInfo[]>();

    static start(path: string, mqttConfig: HomieMqttServerConfig): VbusReader {
        return new VbusReader(path, mqttConfig)
    }

    constructor(path: string, private mqttConfig: HomieMqttServerConfig) {
        this.connection = new SerialConnection({
            path: path,
        });
        this.init();
    }


    private init(): void {
        const connect$ = from(this.connection.connect());

        this.connection.on('packet', p => this.onPacket(p));

        connect$
            .pipe(
                catchError(e => {
                    myLogger.error('Connection failed', e);
                    return throwError(e);
                }))
            .subscribe(val => {
                myLogger.info('Connected to serial port', val);
                this.initHomieDevice()
            });
    }

    private onPacket(packet: Packet): void {
        myLogger.silly(`Packet received: ${packet.getId()}`);

        // most of the time we only need a few paketFields, so whitelist the desired ones
        const whitelist = [
            pumpSpeedRelay1,
            temperatureSensor1,
            temperatureSensor2,
            temperatureSensor3
        ];
        const packetFields = this.specification.getPacketFieldsForHeaders([packet]);
        const vbusInfos = packetFields
            .filter(p => whitelist.includes(p.name))
            .map(paket => ({name: paket.name, value: paket.rawValue}));

        this.vbusInfos$$.next(vbusInfos);
    }

    private initHomieDevice() {
        // Create homie-device
        // This example produces the following mqtt homie topics
        // homie/vbus/$homie: 3.0
        // homie/vbus/$name: Solar-Info
        // homie/vbus/$nodes: kollektor,speicher,pumpe
        // homie/vbus/kollektor/$name: Kollektor
        // homie/vbus/kollektor/$type: nodeType
        // homie/vbus/kollektor/$properties: temperatur
        // homie/vbus/kollektor/temperatur: 11
        // homie/vbus/kollektor/temperatur/$name: temperatur
        // homie/vbus/kollektor/temperatur/$datatype: float
        // homie/vbus/speicher/$name: Speicher
        // homie/vbus/speicher/$type: nodeType
        // homie/vbus/speicher/$properties: temperaturUnten,temperaturOben
        // homie/vbus/speicher/temperaturUnten: 32
        // homie/vbus/speicher/temperaturUnten/$name: temperaturUnten
        // homie/vbus/speicher/temperaturUnten/$datatype: float
        // homie/vbus/speicher/temperaturOben: 65
        // homie/vbus/speicher/temperaturOben/$name: temperaturOben
        // homie/vbus/speicher/temperaturOben/$datatype: float
        // homie/vbus/pumpe/$name: Pumpe
        // homie/vbus/pumpe/$type: nodeType
        // homie/vbus/pumpe/$properties: rpm
        // homie/vbus/pumpe/rpm: 50
        // homie/vbus/pumpe/rpm/$name: rpm
        // homie/vbus/pumpe/rpm/$datatype: float

        this.homieDevice = HomieDevice.create('vbus', 'Solar-Info', this.mqttConfig);
        const kollektorNode = {
            homieInitialized: false,
            nodeId: 'kollektor',
            nodeName: 'Kollektor',
            properties: {
                temperatur: {
                    type: 'float',
                    value: undefined
                }
            }
        } as DeviceNode;
        const speicherNode = {
            homieInitialized: false,
            nodeId: 'speicher',
            nodeName: 'Speicher',
            properties: {
                temperaturUnten: {
                    type: 'float',
                    value: undefined
                },
                temperaturOben: {
                    type: 'float',
                    value: undefined
                }
            }
        } as DeviceNode;
        const pumpeNode = {
            homieInitialized: false,
            nodeId: 'pumpe',
            nodeName: 'Pumpe',
            properties: {
                rpm: {
                    type: 'float',
                    value: undefined
                }
            }
        } as DeviceNode;

        this.homieDevice.addNodes(kollektorNode, speicherNode, pumpeNode);

        this.vbusInfos$$
            .pipe(
                // Only emit info every 10seconds
                throttleTime(10000)
            )
            .subscribe(infos => {
                this.updateIfPresent(infos, temperatureSensor1, kollektorNode, 'temperatur');
                this.updateIfPresent(infos, temperatureSensor2, speicherNode, 'temperaturUnten');
                this.updateIfPresent(infos, temperatureSensor3, speicherNode, 'temperaturOben');
                this.updateIfPresent(infos, pumpSpeedRelay1, pumpeNode, 'rpm');
            });

        myLogger.info('Homie device initialized');
    }

    private updateIfPresent(infos: VbusFieldInfo[], infoName: string, node: DeviceNode, propertyName: string) {
        const vbusFieldInfo = infos.find(p => p.name === infoName);
        if (vbusFieldInfo) {
            node.properties[propertyName].value = vbusFieldInfo.value;
        }
    }
}

interface VbusFieldInfo {
    name: string;
    value: number;
}
