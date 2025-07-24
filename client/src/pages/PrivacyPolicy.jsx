import React from "react";

const PrivacyPolicy = () => {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 bg-gray-100 text-gray-800">
      <h1 className="text-4xl font-bold mb-6">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-8">Effective Date: July 21, 2025</p>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2">1. Introduction</h2>
        <p>
          DinkDonk (“we”, “our”, or “us”) respects your privacy. This Privacy Policy explains how we collect, use, and protect your information when you use our service, which provides Twitch stream notifications via Discord.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2">2. What Information We Collect</h2>
        <ul className="list-disc pl-5">
          <li><strong>Discord ID:</strong> To identify and message you.</li>
          <li><strong>Twitch streamers you follow:</strong> To determine who you want notifications for.</li>
          <li><strong>Notification preferences:</strong> To manage how and when you are notified.</li>
        </ul>
        <p className="mt-2">
          We do <strong>not</strong> collect your email address, phone number, or passwords.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2">3. How We Use Your Data</h2>
        <p>We use your data to:</p>
        <ul className="list-disc pl-5">
          <li>Send you Twitch live notifications through Discord</li>
          <li>Display personalized content on your dashboard</li>
          <li>Maintain and improve the service</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2">4. How We Store Your Data</h2>
        <p>
          Your data is stored securely in a protected Firestore database. We follow industry-standard practices to prevent unauthorized access. Tokens (if used) are encrypted and never shared.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2">5. Data Sharing</h2>
        <p>
          We do <strong>not</strong> sell or rent your data. Your information is only shared with:
        </p>
        <ul className="list-disc pl-5">
          <li>Discord (to deliver notifications)</li>
          <li>Twitch (to get streamer status)</li>
        </ul>
        <p className="mt-2">
          Both platforms have their own privacy policies which you should review.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2">6. Cookies and Tracking</h2>
        <p>
          DinkDonk does not use cookies for tracking or advertising. We may use cookies to keep you logged in or store light/dark mode preferences.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2">7. Your Rights</h2>
        <p>
          You can request the deletion of your data or opt-out of notifications at any time via your dashboard or by contacting us. You may also remove the bot from Discord.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2">8. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy occasionally. Any changes will be posted on this page with an updated effective date. We may notify you via Discord or the dashboard if the changes are significant.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-2">9. Contact Us</h2>
        <p>
          If you have any questions about this Privacy Policy or your data, you can reach us at:{" "}
          <a href="mailto:contact@dinkdonk.donuts.ovh" className="text-blue-600 underline">
            contact@dinkdonk.donuts.ovh
          </a>
        </p>
      </section>
    </div>
  );
};

export default PrivacyPolicy;
