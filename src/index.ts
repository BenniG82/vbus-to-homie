import { myLogger } from './logger';
import { SerialConnection, Specification } from 'resol-vbus';

const connection = new SerialConnection({
    path: '/dev/virtualcom0'
});

const connectPromise = connection.connect();
const spec = Specification.getDefaultSpecification();

const onPacket = (packet: any) => {
    myLogger.debug(`Packet received: ${packet.getId()}`);
    const whitelist = ['Pump speed relay 1', 'Temperature sensor 1', 'Temperature sensor 2', 'Temperature sensor 3'];
    const packetFields = spec.getPacketFieldsForHeaders([packet]);
    const matching = packetFields
        .filter((p: any) => whitelist.includes(p.name))
        .map(paket => ({name: paket.name, value: paket.rawValue}));
    myLogger.debug('Matching fields:', matching);
};

connection.on('packet', onPacket);

connectPromise.then(() => {
    myLogger.info('Connected to serial port');
}, (e: any) => {
    myLogger.error('Connection failed', e);
});
