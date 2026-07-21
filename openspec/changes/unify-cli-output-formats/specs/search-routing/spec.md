## ADDED Requirements

### Requirement: Search output preserves exact references and actionable paging guidance
Search pretty and text output MUST preserve each complete Resource Ref without truncation or ellipsis. Text output MUST encode every result as deterministic escaped TSV. Pretty output MUST remain usable when Microsoft immutable ids or other Ref suffixes exceed the terminal width by switching to complete vertical records when needed.

An exact one-Source remote result MAY expose the Adapter continuation through the result pagination envelope. A multi-Source remote result MUST NOT claim that it returned a continuation when its merged pagination contract exposes none. If one Source reports truncation in a multi-Source search, the warning MUST name that exact Source and instruct the caller to rerun the unchanged search with that exact Source selection; it MUST NOT instruct the caller to resume with a returned continuation.

#### Scenario: Long Microsoft Ref remains copyable
- **WHEN** search pretty output includes a Microsoft immutable-id Ref longer than a table column or terminal row
- **THEN** the complete Ref is present verbatim in output without an ellipsis or removed suffix

#### Scenario: Text search never ellipsizes
- **WHEN** search runs with `--format text`
- **THEN** each result is one escaped TSV row containing the complete Ref and deterministic result fields

#### Scenario: Multi-Source truncation does not promise an absent cursor
- **WHEN** a multi-Source remote search receives a truncation warning from one Source and returns no merged continuation
- **THEN** the warning tells the operator to rerun with that exact Source and does not claim that a continuation was returned
