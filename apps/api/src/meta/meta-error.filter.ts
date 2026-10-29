import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { MetaApiError } from './graph.client';

/** Los errores de Meta llegan al frontend como 502 con el mensaje de Meta. */
@Catch(MetaApiError)
export class MetaErrorFilter implements ExceptionFilter {
  catch(error: MetaApiError, host: ArgumentsHost) {
    host
      .switchToHttp()
      .getResponse()
      .status(502)
      .json({
        statusCode: 502,
        message: `Meta: ${error.message}`,
        meta: { code: error.code, subcode: error.subcode, fbtrace_id: error.fbtraceId },
      });
  }
}
