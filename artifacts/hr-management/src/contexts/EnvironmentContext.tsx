import { createContext, useContext, useEffect, ReactNode } from "react";
import { useGetEnvironment, getGetEnvironmentQueryKey, EnvironmentStatusEnvironment } from "@workspace/api-client-react";

interface EnvironmentContextType {
  environment: EnvironmentStatusEnvironment | undefined;
  isDev: boolean;
}

const EnvironmentContext = createContext<EnvironmentContextType | undefined>(undefined);

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const { data } = useGetEnvironment({
    query: { retry: false, queryKey: getGetEnvironmentQueryKey() },
  });

  const isDev = data?.environment === EnvironmentStatusEnvironment.development;

  useEffect(() => {
    document.documentElement.classList.toggle("theme-dev", isDev);
  }, [isDev]);

  return (
    <EnvironmentContext.Provider value={{ environment: data?.environment, isDev }}>
      {children}
    </EnvironmentContext.Provider>
  );
}

export function useEnvironment() {
  const context = useContext(EnvironmentContext);
  if (context === undefined) {
    throw new Error("useEnvironment must be used within an EnvironmentProvider");
  }
  return context;
}
