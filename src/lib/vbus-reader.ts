import {Packet, SerialConnection, Specification} from 'resol-vbus';
import {myLogger} from '../logger';
import {DeviceNode, HomieMqttServerConfig} from './interfaces';
import {from, Subject, throwError} from 'rxjs';
import {catchError, throttleTime} from 'rxjs/operators';
import {HomieDevice} from './homie-device';

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
        const whitelist = [
            'Pump speed relay 1',
            'Temperature sensor 1',
            'Temperature sensor 2',
            'Temperature sensor 3'
        ];
        const packetFields = this.specification.getPacketFieldsForHeaders([packet]);
        const vbusInfos = packetFields
            .filter(p => whitelist.includes(p.name))
            .map(paket => ({name: paket.name, value: paket.rawValue}));

        this.vbusInfos$$.next(vbusInfos);
    }

    private initHomieDevice() {
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
                throttleTime(10000)
            )
            .subscribe(infos => {
                this.updateIfPresent(infos, 'Temperature sensor 1', kollektorNode, 'temperatur');
                this.updateIfPresent(infos, 'Temperature sensor 2', speicherNode, 'temperaturUnten');
                this.updateIfPresent(infos, 'Temperature sensor 3', speicherNode, 'temperaturOben');
                this.updateIfPresent(infos, 'Pump speed relay 1', pumpeNode, 'rpm');
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
