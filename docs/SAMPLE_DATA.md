# Sample data — everything here is synthetic

`sample-roster-facts-users.csv` (repo root) contains **449 entirely synthetic
student rows** used as referenced test data for the roster import parsers
(FACTS/OneRoster-style users.csv shape). Every name, date of birth, grade and
identifier in it was generated for testing; **no row corresponds to a real
person**. The file is deliberately realistic-looking so the importers are tested
against the shapes real SIS exports produce.

CSV has no comment syntax the parsers would tolerate, so the file itself cannot
carry this notice — this document and the README line are the notice. Do not
delete or untrack the file (specs and manual import walkthroughs reference it),
and do not add real exported rosters to the repository under any name: real
student data lives only in a school's own database rows, behind the register's
role gates.
