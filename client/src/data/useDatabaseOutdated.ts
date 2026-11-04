import { useEffect, useState } from "react";
import { onDatabaseOutdated } from "./database";

/** True once another tab has upgraded the database under this one (see `onDatabaseOutdated`). */
export function useDatabaseOutdated(): boolean {
  const [outdated, setOutdated] = useState(false);
  useEffect(() => onDatabaseOutdated(() => setOutdated(true)), []);
  return outdated;
}
