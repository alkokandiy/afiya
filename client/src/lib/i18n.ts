import { createContext, useCallback, useContext } from "react";
import { toCyrillic } from "../../../shared/translit";
import { titleIn, type Script } from "../../../shared/types";

// Every string in the app is written in Uzbek Latin; t() converts it when the reader chose Cyrillic.
export const ScriptContext = createContext<{ script: Script; setScript: (script: Script) => void }>({
  script: "latn",
  setScript: () => {},
});

export function useScript() {
  return useContext(ScriptContext);
}

export function useT() {
  const { script } = useContext(ScriptContext);
  return useCallback((latin: string) => (script === "cyrl" ? toCyrillic(latin) : latin), [script]);
}

/** Product names: the hand-written Cyrillic name when there is one, otherwise transliterated. */
export function useTitle() {
  const { script } = useContext(ScriptContext);
  return useCallback((item: { title: string; titleCyr: string }) => titleIn(item, script === "cyrl", toCyrillic), [script]);
}
