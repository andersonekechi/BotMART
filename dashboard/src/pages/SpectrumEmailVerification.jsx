export default function SpectrumEmailVerification() {
  return (
    <div className="login-page spectrum-verification-page">
      <div className="login-card">
        <div className="login-header">
          <img
            src="https://imagedelivery.net/QKyhHh3AN6D79lM-HgCJLg/e3ffca70-021b-4e56-023d-c697624ad800/public"
            alt="Spectrum"
            className="spectrum-logo"
          />
          <h1>Verify Your Email</h1>
          <p>We&apos;ve sent a verification link to your email address. Please check your inbox and click the link to verify your account.</p>
        </div>
        <div className="verification-actions">
          <p className="verification-hint">Didn&apos;t receive the email? Check your spam folder or request a new verification link.</p>
        </div>
      </div>
    </div>
  );
}
