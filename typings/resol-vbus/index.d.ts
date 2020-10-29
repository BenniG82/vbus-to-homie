// tslint:disable:max-classes-per-file
declare module 'resol-vbus' {
    import {Duplex} from 'stream';

    export class Specification {
        static getDefaultSpecification(): Specification;

        getPacketFieldsForHeaders(pakets: Array<Packet>): Array<PacketFields>;
    }

    export class SerialConnection extends Duplex {
        constructor(options: SerialConnectionOptions);

        connect(): Promise<void>;
    }

    export interface SerialConnectionOptions {
        path: string;
    }

    export interface PacketFields {
        id: string;
        packet: Packet;
        packetSpec: PacketSpec;
        packetFieldSpec: PacketFieldSpecOrOrigPacketFieldSpec;
        origPacketFieldSpec: PacketFieldSpecOrOrigPacketFieldSpec;
        name: string;
        rawValue: number;
    }

    export interface Packet {
        getId(): string;

        destinationAddress: number;
        sourceAddress: number;
        timestamp: string;
        command: number;
        frameCount: number;
        frameData: FrameData;
        channel: number;
    }

    export interface FrameData {
        type: string;
        data?: Array<number> | null;
    }

    export interface PacketSpec {
        packetId: string;
        packetFields?: Array<PacketFieldsEntity> | null;
        channel: number;
        destinationAddress: number;
        sourceAddress: number;
        protocolVersion: number;
        command: number;
        info: number;
        destinationDevice: DestinationDeviceOrSourceDevice;
        sourceDevice: DestinationDeviceOrSourceDevice;
        fullName: string;
    }

    export interface PacketFieldsEntity {
        fieldId: string;
        name: Name;
        type: Type;
        factor: number;
        parts?: Array<PartsEntity> | null;
    }

    export interface Name {
        en: string;
        de: string;
        fr: string;
    }

    export interface Type {
        typeId: string;
        rootTypeId: string;
        precision: number;
        unit: Unit;
    }

    export interface Unit {
        unitId: string;
        unitCode: string;
        unitFamily?: string | null;
        unitText: string;
    }

    export interface PartsEntity {
        offset: number;
        mask: number;
        bitPos: number;
        isSigned: boolean;
        factor: number;
    }

    export interface DestinationDeviceOrSourceDevice {
        name: string;
        deviceId: string;
        channel: number;
        selfAddress: number;
        peerAddress: number;
        fullName: string;
    }

    export interface PacketFieldSpecOrOrigPacketFieldSpec {
        fieldId: string;
        name: Name;
        type: Type;
        factor: number;
        parts?: Array<PartsEntity> | null;
    }

}
