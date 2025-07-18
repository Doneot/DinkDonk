import { useState } from "react";

const EmbedPreview = () => {
  const [show, setShow] = useState(false);

  return (
    <div className="p-6 bg-white rounded-xl shadow-lg mt-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-700">
        Embed Preview
      </h2>
      <button
        className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition"
        onClick={() => setShow(!show)}
      >
        {show ? "Hide" : "Test Embed"}
      </button>

      {show && (
        <div className="border-l-4 border-indigo-500 bg-gray-50 p-4 mt-4 rounded-md">
          <p className="text-sm text-gray-600">
            📢 <strong>Stream Alert</strong>
          </p>
          <p className="text-gray-800">Streamer XYZ is now live on Twitch!</p>
          <a href="https://twitch.tv/xyz" className="text-indigo-700 text-sm">
            https://twitch.tv/xyz
          </a>
        </div>
      )}
    </div>
  );
};

export default EmbedPreview;
