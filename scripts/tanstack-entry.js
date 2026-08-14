// Entry point bundle vendor TanStack Table (dibangun dengan esbuild).
// Output di-commit ke public/vendor/tanstack-table.js supaya app jalan
// tanpa langkah build dan tanpa internet. Rebuild: npm run build:vendor
import * as TableCore from '@tanstack/table-core';
import { storeReactivityBindings } from '@tanstack/table-core/store-reactivity-bindings';

window.TanStackTableCore = TableCore;
window.TanStackStoreBindings = { storeReactivityBindings };
