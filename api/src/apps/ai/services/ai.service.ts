import { ErrorResponse, ServiceResponse } from '../../../common/shared';
import type {
  CosChatInput,
  CosChatReply,
  LoaChatInput,
  LoaChatReply,
  ObChatInput,
  ObChatReply,
  OtChatInput,
  OtChatReply,
} from '@swiftslip/shared/schemas';
import type { SessionUser } from '@swiftslip/shared/types';
import { ActivityLogService } from '../../activity-log';
import { chatCosAssistant } from '../prompts/cos-chat';
import { writeCosReason } from '../prompts/cos-reason';
import { chatLoaAssistant } from '../prompts/loa-chat';
import { writeLoaReason } from '../prompts/loa-reason';
import { chatObAssistant } from '../prompts/ob-chat';
import { writeObPurpose } from '../prompts/ob-purpose';
import { chatOtAssistant } from '../prompts/ot-chat';
import { writeOtReason } from '../prompts/ot-reason';
import AiQuotaService from './ai-quota.service';

type DraftInput = {
  mode: 'generate' | 'enhance';
  context: string;
  current: string;
};

/**
 * The Gemini-backed helpers on the forms. Every call is quota-checked first
 * and counted afterwards, so each method is just "which prompt to run".
 */
class AiService {
  /** Quota check → run → count. Also used by the biometric import. */
  async run<T>(
    user: SessionUser,
    feature: string,
    task: () => Promise<T>,
  ): Promise<ServiceResponse<T>> {
    try {
      await AiQuotaService.assert(user);
      const document = await task();
      await ActivityLogService.logBy(user, {
        action: 'ai.request',
        target: feature,
      });
      return { success: true, document };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof ErrorResponse
            ? error
            : new ErrorResponse(
                'INTERNAL_SERVER_ERROR',
                (error as Error).message,
              ),
      };
    }
  }

  obPurpose(user: SessionUser, input: DraftInput) {
    return this.run(user, 'OB purpose', () => writeObPurpose(input));
  }

  obChat(
    user: SessionUser,
    input: ObChatInput,
  ): Promise<ServiceResponse<ObChatReply>> {
    return this.run(user, 'OB assistant', () => chatObAssistant(input));
  }

  loaReason(user: SessionUser, input: DraftInput) {
    return this.run(user, 'LOA reason', () => writeLoaReason(input));
  }

  loaChat(
    user: SessionUser,
    input: LoaChatInput,
  ): Promise<ServiceResponse<LoaChatReply>> {
    return this.run(user, 'LOA assistant', () => chatLoaAssistant(input));
  }

  cosReason(user: SessionUser, input: DraftInput) {
    return this.run(user, 'COS reason', () => writeCosReason(input));
  }

  cosChat(
    user: SessionUser,
    input: CosChatInput,
  ): Promise<ServiceResponse<CosChatReply>> {
    return this.run(user, 'COS assistant', () => chatCosAssistant(input));
  }

  otReason(user: SessionUser, input: DraftInput) {
    return this.run(user, 'OT reason', () => writeOtReason(input));
  }

  otChat(
    user: SessionUser,
    input: OtChatInput,
  ): Promise<ServiceResponse<OtChatReply>> {
    return this.run(user, 'OT assistant', () => chatOtAssistant(input));
  }
}

export default new AiService();
