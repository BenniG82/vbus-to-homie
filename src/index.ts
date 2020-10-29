import {HomieMqttServerConfig} from './lib/interfaces';
import {VbusReader} from './lib/vbus-reader';

export const mqttConfig: HomieMqttServerConfig = {
    brokerUrl: 'mqtt://192.168.0.45',
    username: 'mqtt',
    password: 'password',
    homieBaseTopic: 'homie'
};

const path = '/dev/virtualcom0';

VbusReader.start(path, mqttConfig);
