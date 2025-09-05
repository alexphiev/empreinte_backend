# Bilan Carbone PDF Service

## Development

Copy env.dist to .env and fill the values and replace the API_SECRET_KEY with a generated value.

```bash
openssl rand -hex 32
```

Then copy the generated value to the .env file.

```bash
cp .env.dist .env
```

Install dependencies:

```bash
pnpm install
```

### Run locally in development mode

```bash
pnpm dev
```
