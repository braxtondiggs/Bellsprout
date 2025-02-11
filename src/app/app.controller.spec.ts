import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { Brewery } from './interfaces/brewery.interface';

describe('AppController', () => {
  let controller: AppController;
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getData: jest.fn()
          }
        }
      ]
    }).compile();

    controller = module.get<AppController>(AppController);
    service = module.get<AppService>(AppService);
  });

  describe('health-check', () => {
    it('should return health status', async () => {
      const result = await controller.healthCheck();
      expect(result.status).toBe('ok');
      expect(result.message).toBe('API is healthy');
      expect(result.timestamp).toBeDefined();
    });
  });

  describe('getData', () => {
    it('should return data from service', async () => {
      const mockData = { name: 'data' } as Brewery;
      jest.spyOn(service, 'getData').mockResolvedValue(mockData);

      const result = await controller.getData();
      expect(result).toBe(mockData);
    });

    it('should throw error when service fails', async () => {
      const error = new Error('Service error');
      jest.spyOn(service, 'getData').mockRejectedValue(error);

      await expect(controller.getData()).rejects.toThrow(error);
    });
  });
});
