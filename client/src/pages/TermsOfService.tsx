const TermsOfService = () => {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12 bg-bg text-ink-dim">
      <h1 className="font-display uppercase [font-stretch:condensed] text-4xl font-bold mb-6 text-ink">
        Terms of Service
      </h1>
      <p className="font-mono text-xs uppercase tracking-wider text-ink-faint mb-8">
        Effective Date: July 21, 2025
      </p>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2 text-ink">
          1. Description of Service
        </h2>
        <p>
          DinkDonk is a web application that connects with your Discord and
          Twitch accounts to notify you when your followed Twitch streamers go
          live. You can manage your preferences via a dashboard and receive
          alerts via Discord direct messages.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2 text-ink">2. Eligibility</h2>
        <p>
          You must be at least 13 years old to use this Service. By using
          DinkDonk, you confirm that you are legally eligible and have the
          authority to enter into these Terms.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2 text-ink">
          3. Account and Data
        </h2>
        <p>
          You may log in with your Discord account. We store your Discord user
          ID, Twitch follow preferences, and notification settings. We do not
          store passwords. Any access tokens are securely stored and only used
          for the functionality you've authorized.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2 text-ink">
          4. User Responsibilities
        </h2>
        <ul className="list-disc pl-5 marker:text-accent">
          <li>Do not misuse the platform or attempt to disrupt it.</li>
          <li>Do not use the Service for illegal or abusive behavior.</li>
          <li>Do not resell or exploit the Service without permission.</li>
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2 text-ink">
          5. Notifications via Discord
        </h2>
        <p>
          By using DinkDonk, you agree to receive bot messages on Discord. You
          can opt out at any time via your dashboard or by removing the bot from
          your DMs.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2 text-ink">
          6. Intellectual Property
        </h2>
        <p>
          All content, code, and designs are property of Doneot, unless
          otherwise noted. External services like Discord and Twitch are used
          under their own terms.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2 text-ink">7. Termination</h2>
        <p>
          We may suspend or remove your access to DinkDonk at our discretion,
          particularly if you violate these Terms. You may request account or
          data removal at any time.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2 text-ink">8. Disclaimer</h2>
        <p>
          The Service is provided "as is" with no guarantees. We are not liable
          for missed notifications, bot downtime, or changes in external APIs
          such as Twitch or Discord.
        </p>
      </section>

      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-2 text-ink">
          9. Changes to Terms
        </h2>
        <p>
          These Terms may be updated from time to time. Significant changes will
          be communicated via the dashboard or Discord.
        </p>
      </section>

      <section>
        <h2 className="text-2xl font-semibold mb-2 text-ink">10. Contact</h2>
        <p>
          If you have any questions or requests, you can reach us at:{" "}
          <a
            href="mailto:contact@dinkdonk.donuts.ovh"
            className="text-accent underline hover:text-accent-2"
          >
            contact@dinkdonk.donuts.ovh
          </a>
        </p>
      </section>
    </div>
  );
};

export default TermsOfService;
