## 1. Align bundled Profile vocabulary

- [x] 1.1 Add a focused failing static regression test that compares the canonical Profile specification and accepted V1 design with the three-Profile built-in registry contract.
- [x] 1.2 Correct the canonical `profile-vocabulary` requirement and accepted design, including D10, while preserving extension-defined and future Profiles.
- [x] 1.3 Run the focused static guard and existing built-in Extension registry test.

## 2. Doctrine and final verification

- [x] 2.1 Confirm that no implementation doctrine changed and therefore no canonical `profile-vocabulary/implementation.md` promotion is required.
- [x] 2.2 Run strict validation for the active change and all OpenSpec artifacts, plus `git diff --check`; review the final diff against issue #36 scope.
