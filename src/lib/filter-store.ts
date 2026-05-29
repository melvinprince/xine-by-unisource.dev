import { AsyncLocalStorage } from "async_hooks";
import type { DimensionFilters } from "./api-helpers";

export const filterStore = new AsyncLocalStorage<DimensionFilters>();
