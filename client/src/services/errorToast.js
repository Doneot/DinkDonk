import { toast } from "react-toastify";

// 401s are already handled globally by the axios response interceptor
// (session-expired toast + redirect in services/api.js) - toasting again
// here would just double up right before the redirect happens.
export function notifyActionError(error, fallback) {
  if (error.response?.status === 401) return;
  toast.error(error.response?.data?.message || error.message || fallback);
}
