import { Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from './logger.service';

@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const isProduction = configService.get('NODE_ENV') === 'production';
        const logLevel = configService.get('LOG_LEVEL', 'info');

        return {
          pinoHttp: {
            level: logLevel,
            transport: isProduction
              ? undefined
              : {
                  target: 'pino-pretty',
                  options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                    singleLine: false,
                    messageFormat: '{levelLabel} - {msg}',
                  },
                },
            serializers: {
              req: (req) => ({
                id: req.id,
                method: req.method,
                url: req.url,
              }),
              res: (res) => ({
                statusCode: res.statusCode,
              }),
            },
            autoLogging: {
              ignore: (req) => {
                // Ignore health check and metrics endpoints
                return req.url === '/api/health' || req.url === '/metrics';
              },
            },
            customProps: (req) => ({
              context: 'HTTP',
            }),
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.passwordConfirm',
                'req.body.oldPassword',
                'req.body.newPassword',
              ],
              censor: '[REDACTED]',
            },
          },
        };
      },
    }),
  ],
  providers: [LoggerService],
  exports: [PinoLoggerModule, LoggerService],
})
export class LoggerModule {}
