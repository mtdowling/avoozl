# {{sdk}} SDK rewrite

## Introduction

Rewrite the {{sdk}} SDK on the new runtime, keeping what callers rely on.

## Requirements

### Requirement 1: Same operations

**User story:** As a caller, I want every operation of the old {{sdk}} SDK
in the new one, so that I can switch without losing anything.

#### Acceptance criteria

1. The new SDK SHALL offer every operation the old one offers.
2. Every protocol test SHALL pass against the new SDK.

### Requirement 2: Reviewed before cutover

**User story:** As the team, we want to review the results before callers
switch, so that a cutover never surprises us.

#### Acceptance criteria

1. Callers SHALL NOT switch before the team has reviewed the results.
