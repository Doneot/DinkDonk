import { isAxiosError } from "axios";
import { toast } from "react-toastify";

// 401s are already handled globally by the axios response interceptor
// (session-expired toast + redirect in shared/api/client.ts) - toasting
// again here would just double up right before the redirect happens.
export function notifyActionError(error: unknown, fallback: string): void {
  if (isAxiosError(error)) {
    if (error.response?.status === 401) return;

    const data = error.response?.data as { message?: string } | undefined;
    toast.error(data?.message || error.message || fallback);
    return;
  }

  const message = error instanceof Error ? error.message : undefined;
  toast.error(message || fallback);
}
