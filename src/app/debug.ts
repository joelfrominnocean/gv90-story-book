import { createContext, useContext } from "react";

/** True when ?debug=1. Every string renders a source badge when set. */
const DebugContext = createContext(false);
export const DebugProvider = DebugContext.Provider;
export const useDebug = (): boolean => useContext(DebugContext);
