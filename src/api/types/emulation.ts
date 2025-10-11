import type { ParsedTracePart } from '../chains/ton/types';
import type { ApiActivity } from './activities';

export type ApiEmulationResult = {
  networkFee: bigint;
  /** How much TON will return back as a result of the transactions */
  received: bigint;
  /** Sometimes the array contains fewer indices than the number of transactions */
  byTransactionIndex: ParsedTracePart[];
  /** What else should happen after submitting the transactions (in addition to the transactions and the returned TON) */
  activities: ApiActivity[];
  /** The total real fee of `activities` (makes no sense without them) */
  realFee: bigint;
};
