import * as winston from 'winston';
import util from 'util';

const {combine, timestamp, printf, simple, splat} = winston.format;

const prettyJson = printf(info => {
    const copy = {...info};
    delete copy.level;
    delete copy.timestamp;
    delete copy.message;
    const additions = Object.keys(copy).length > 0 ? util.inspect(copy) : '';

    return `${info.timestamp} ${info.level}: ${info.message} ${additions}`;
});
// const myFormat = printf(info => `${info.timestamp} ${info.level}: ${info.message}`);

export const myLogger = winston.createLogger({
    level: 'debug',
    format: combine(
        splat(),
        simple(),
        timestamp(),
        prettyJson
    ),
    transports: [
        new winston.transports.Console({})
    ]
});
