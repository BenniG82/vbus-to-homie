import * as winston from 'winston';
import * as util from 'util';

const {combine, timestamp, printf, simple, splat} = winston.format;

const prettyJson = printf(info => {
    const copy: { [key: string]: string } = {...info};
    delete copy.level;
    delete copy.timestamp;
    delete copy.message;
    const additions = Object.keys(copy).length > 0 ? util.inspect(copy) : '';

    return `${info.timestamp} ${info.level}: ${info.message} ${additions}`;
});

export const myLogger = winston.createLogger({
    level: 'debug',
    format: combine(splat(), simple(), timestamp(), prettyJson),
    transports: [new winston.transports.Console({})],
});
