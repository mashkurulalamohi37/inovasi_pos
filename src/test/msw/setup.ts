import { afterAll, afterEach, beforeAll } from "vitest";
import { resetMswState } from "./handlers";
import { server } from "./server";

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => {
  server.resetHandlers();
  resetMswState();
});
afterAll(() => server.close());
