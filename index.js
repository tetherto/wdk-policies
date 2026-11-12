// Copyright 2024 Tether Operations Limited
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
'use strict'

/** @typedef {import('./src/index.js').Policy} Policy */
/** @typedef {import('./src/index.js').PolicyRule} PolicyRule */
/** @typedef {import('./src/index.js').PolicyCondition} PolicyCondition */
/** @typedef {import('./src/index.js').PolicyContext} PolicyContext */
/** @typedef {import('./src/index.js').PolicyAction} PolicyAction */
/** @typedef {import('./src/index.js').PolicyScope} PolicyScope */
/** @typedef {import('./src/index.js').PolicyOperation} PolicyOperation */
/** @typedef {import('./src/index.js').SimulationResult} SimulationResult */
/** @typedef {import('./src/index.js').SimulationTraceEntry} SimulationTraceEntry */
/** @typedef {import('./src/index.js').RegisterPolicyOptions} RegisterPolicyOptions */
/** @typedef {import('./src/index.js').DenialCode} DenialCode */
/** @typedef {import('./src/wdk-policies.js').WdkPoliciesOptions} WdkPoliciesOptions */

export { default, default as WdkPolicies } from './src/wdk-policies.js'
export { PolicyViolationError, PolicyConfigurationError, DEFAULT_POLICY_EXCLUSIONS, DENIAL_CODES } from './src/index.js'
