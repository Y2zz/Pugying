import { Injectable } from '@nestjs/common';
import {
  getProductVersionInfo,
  type ProductVersionInfo,
} from './product-version';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  getProductVersion(): ProductVersionInfo {
    return getProductVersionInfo();
  }
}
