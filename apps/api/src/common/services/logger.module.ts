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
        const logtailToken = configService.get('LOGTAIL_SOURCE_TOKEN');

        // Determine transport based on environment
        let transport;
        if (isProduction && logtailToken) {
          // Production with Better Stack
          const logtailEndpoint = configService.get(
            'LOGTAIL_ENDPOINT',
            'https://in.logs.betterstack.com'
          );
          transport = {
            target: '@logtail/pino',
            options: {
              sourceToken: logtailToken,
              options: { endpoint: logtailEndpoint },
            },
          };
        } else if (!isProduction) {
          // Development with pretty printing
          transport = {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname',
              singleLine: false,
              messageFormat: '{levelLabel} - {msg}',
            },
          };
        }
        // Production without logtail token: no transport (JSON to stdout)

        return {
          pinoHttp: {
            level: logLevel,
            transport,
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
