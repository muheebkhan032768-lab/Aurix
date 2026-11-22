using System;
using System.Threading.Tasks;
using Windows.Security.Credentials.UI;

namespace AurixDesktop
{
    public static class WindowsHelloAuth
    {
        public static async Task<bool> VerifyOwnerAsync(string message)
        {
            try
            {
                var availability = await UserConsentVerifier.CheckAvailabilityAsync();
                if (availability != UserConsentVerifierAvailability.Available)
                {
                    return false;
                }
                var consent = await UserConsentVerifier.RequestVerificationAsync(message);
                return consent == UserConsentVerificationResult.Verified;
            }
            catch
            {
                return false;
            }
        }
    }
}
