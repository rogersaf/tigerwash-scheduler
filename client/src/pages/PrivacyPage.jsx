import React from 'react';

export default function PrivacyPage() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <h1>Privacy Policy</h1>
        <p className="legal-updated">Effective: June 2025</p>

        <p>Tiger Express Wash of Easley ("Company", "we") operates this internal scheduling application. This policy explains how we handle employee data within the App.</p>

        <h2>Information We Collect</h2>
        <ul>
          <li><strong>Name</strong> — used to identify you in the schedule</li>
          <li><strong>PIN</strong> — used for authentication; visible to managers for account recovery</li>
          <li><strong>Availability preferences</strong> — days and shift types you mark as unavailable</li>
          <li><strong>Schedule data</strong> — shifts assigned to you</li>
        </ul>

        <h2>How We Use It</h2>
        <p>All data is used exclusively for internal workforce scheduling at Tiger Express Wash of Easley. We do not sell, share, or transmit your information to any third party.</p>

        <h2>Data Storage</h2>
        <p>Data is stored on a server controlled by the Company. The App does not use third-party analytics, advertising, or tracking services.</p>

        <h2>Who Can See Your Data</h2>
        <p>Managers can view all employee names, PINs (for recovery purposes), availability, and schedules. Other employees cannot view your information.</p>

        <h2>Your Rights</h2>
        <p>You may update your availability at any time within the App. To request removal of your data, speak with your manager.</p>

        <h2>No Payment Information</h2>
        <p>This App does not collect, process, or store any payment or financial information.</p>

        <h2>Contact</h2>
        <p>For privacy questions, contact Tiger Express Wash of Easley management directly.</p>
      </div>
    </div>
  );
}
