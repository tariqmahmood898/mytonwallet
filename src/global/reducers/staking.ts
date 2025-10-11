import type { ApiStakingState } from '../../api/types';
import type { AccountState, GlobalState } from '../types';
import { StakingState } from '../types';

import isPartialDeepEqual from '../../util/isPartialDeepEqual';
import { selectAccountState } from '../selectors';
import { updateAccountState } from './misc';

export function updateCurrentStaking(global: GlobalState, update: Partial<GlobalState['currentStaking']>): GlobalState {
  return {
    ...global,
    currentStaking: {
      ...global.currentStaking,
      ...update,
    },
  };
}

export function clearCurrentStaking(global: GlobalState) {
  return {
    ...global,
    currentStaking: {
      state: StakingState.None,
    },
  };
}

export function updateAccountStaking(
  global: GlobalState,
  accountId: string,
  partial: Partial<NonNullable<AccountState['staking']>>,
  withDeepCompare = false,
): GlobalState {
  const currentStaking = selectAccountState(global, accountId)?.staking;

  if (withDeepCompare && currentStaking && isPartialDeepEqual(currentStaking, partial)) {
    return global;
  }

  return updateAccountState(global, accountId, {
    staking: {
      ...currentStaking,
      ...partial,
    },
  });
}

export function updateAccountStakingStatePartial(
  global: GlobalState,
  accountId: string,
  partial: Partial<AccountState['staking']>,
): GlobalState {
  const currentState = selectAccountState(global, accountId)?.staking;

  if (!currentState) {
    return global;
  }

  return updateAccountState(global, accountId, {
    staking: {
      ...currentState,
      ...partial,
    },
  });
}

export function updateStakingDefault(global: GlobalState, state: ApiStakingState) {
  return {
    ...global,
    stakingDefault: state,
  };
}
