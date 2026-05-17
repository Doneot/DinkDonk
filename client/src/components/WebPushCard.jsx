import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
  disableWebPushNotifications,
  enableWebPushNotifications,
  getExistingPushSubscription,
  isWebPushSupported,
} from '../services/pushNotifications';

const WebPushCard = () => {
  const [supported, setSupported] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const canUsePush = isWebPushSupported();
      if (!mounted) return;
      setSupported(canUsePush);
      if (canUsePush) setEnabled(Boolean(await getExistingPushSubscription()));
      setLoading(false);
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const enable = async () => {
    try {
      setLoading(true);
      await enableWebPushNotifications();
      setEnabled(true);
      toast.success('Browser notifications enabled.');
    } catch (error) {
      toast.error(error.response?.data?.error || error.message || 'Failed to enable browser notifications.');
    } finally {
      setLoading(false);
    }
  };

  const disable = async () => {
    try {
      setLoading(true);
      await disableWebPushNotifications();
      setEnabled(false);
      toast.success('Browser notifications disabled on this device.');
    } catch (error) {
      toast.error(error.message || 'Failed to disable browser notifications.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-md">
      <h2 className="text-xl font-semibold mb-2">Browser Notifications</h2>
      <p className="text-sm text-gray-600 mb-4">
        Get native notifications from this browser when subscribed streamers go live.
      </p>

      {!supported ? (
        <p className="text-sm text-gray-500">
          Web Push is not supported here. On iPhone/iPad, add DinkDonk to your Home Screen and open it from there.
        </p>
      ) : enabled ? (
        <button
          type="button"
          disabled={loading}
          onClick={disable}
          className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700 disabled:opacity-50"
        >
          Disable on this device
        </button>
      ) : (
        <button
          type="button"
          disabled={loading}
          onClick={enable}
          className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
        >
          Enable notifications
        </button>
      )}
    </div>
  );
};

export default WebPushCard;
