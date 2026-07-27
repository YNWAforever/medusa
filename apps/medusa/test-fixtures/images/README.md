# Synthetic Image Fixtures

All fixtures in this directory are generated images with no customer content.

Run `node generate-fixtures.mjs` from this directory after installing the Medusa workspace dependencies. The 120 megapixel fixture is intentionally large and validates the decode boundary without exceeding it. `synthetic.heic` is a signature-only fixture for MIME routing; HEIC conversion behavior is covered with an injected converter in unit tests.
