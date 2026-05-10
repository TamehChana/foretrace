import { Test, TestingModule } from '@nestjs/testing';
import { API_NAME } from '@foretrace/shared';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return the API greeting', () => {
      expect(appController.getHello()).toBe(
        `${API_NAME} — Foretrace API online`,
      );
    });
  });
});
