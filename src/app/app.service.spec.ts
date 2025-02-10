import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';
import { GenkitService } from './services/genkit.service';

describe('AppService', () => {
  let service: AppService;
  let mockFirebaseAdmin: any;
  let mockGenkitService: any;

  beforeEach(async () => {
    mockFirebaseAdmin = {
      firestore: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnThis(),
        doc: jest.fn().mockReturnThis(),
        get: jest.fn(),
      }),
    };

    mockGenkitService = {
      getNewsletterFlow: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppService,
        {
          provide: 'FIREBASE_ADMIN',
          useValue: mockFirebaseAdmin,
        },
        {
          provide: GenkitService,
          useValue: mockGenkitService,
        },
      ],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
