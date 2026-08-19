// Shared HTTP-error-message parsing for service modules. Handles both the shape
// docs/specs/api-contracts.md documents ({ error: { code, message } }) and Nest's actual default
// ValidationPipe/HttpException shape ({ message, error, statusCode }, message either a string or
// an array of validation failures) — Auth Service returns the latter in practice, confirmed
// against the running service. Flagged as a spec/impl mismatch worth reconciling in the backend,
// not silently "fixed" here; the frontend just needs to show real text either way.
export async function parseErrorMessage(response) {
  try {
    const body = await response.json();
    if (body?.error?.message) return body.error.message;
    if (Array.isArray(body?.message)) return body.message.join(' ');
    if (typeof body?.message === 'string') return body.message;
  } catch {
    // response wasn't JSON — fall through to the generic message below
  }
  return `HTTP ${response.status}`;
}
