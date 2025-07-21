// SubscribedStreamersList.jsx

const SubscribedStreamersList = ({
  streamerData,
  handleUnsubscribe,
  handleSubscribe,
  handleMessageChange,
  disabled,
}) => {
  const allStreamerIds = Object.keys(streamerData);

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg mt-6 w-full max-w-3xl mx-auto">
      <h2 className="text-xl font-semibold mb-4 text-gray-700">
        Your Subscribed Streamers
      </h2>
      {allStreamerIds.length === 0 ? (
        <p className="text-gray-500">No streamers found.</p>
      ) : (
        <ul className="space-y-4">
          {allStreamerIds.map((id) => {
            const s = streamerData[id];
            return (
              <li
                key={id}
                className="flex items-center justify-between border p-4 rounded-lg shadow-sm bg-gray-50"
              >
                <div className="flex items-center gap-3">
                  <img
                    src={s.avatar}
                    alt={s.name}
                    className="w-10 h-10 rounded-full"
                  />
                  <span className="text-gray-800 font-medium">{s.name}</span>
                </div>
                <input
                  type="text"
                  value={s.message || ""}
                  onChange={(e) => handleMessageChange(id, e.target.value)}
                  placeholder="Custom notification message"
                  className={`flex-1 mx-4 p-2 border rounded-md text-sm text-black transition duration-200 ${
                    disabled
                      ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                      : "bg-white"
                  }`}
                  disabled={disabled}
                />
                <button
                  className={`px-4 py-2 rounded-md text-sm font-medium transition duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-75 ${
                    s.isSubscribed
                      ? disabled
                        ? "bg-gray-300 text-gray-700"
                        : "bg-red-500 hover:bg-red-600 text-white"
                      : disabled
                      ? "bg-gray-300 text-gray-700"
                      : "bg-green-500 hover:bg-green-600 text-white"
                  }`}
                  onClick={() =>
                    s.isSubscribed ? handleUnsubscribe(id) : handleSubscribe(id)
                  }
                  disabled={disabled}
                >
                  {s.isSubscribed ? "Unsubscribe" : "Subscribe"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default SubscribedStreamersList;
