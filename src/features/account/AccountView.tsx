import { useEffect } from "react";
import AccountSettings from "../../components/AccountSettings";
import { useWorkspace } from "../../workspace/WorkspaceContext";

const AccountView = () => {
  const {
    session,
    handleUpdateAccount,
    isUpdatingAccount,
    accountUpdateError,
    accountUpdateSuccess,
    clearAccountFeedback,
  } = useWorkspace();

  useEffect(() => {
    return () => {
      clearAccountFeedback();
    };
  }, [clearAccountFeedback]);

  if (!session?.user) {
    return null;
  }

  return (
    <AccountSettings
      user={session.user}
      onUpdateProfile={handleUpdateAccount}
      isSaving={isUpdatingAccount}
      errorMessage={accountUpdateError}
      successMessage={accountUpdateSuccess}
    />
  );
};

export default AccountView;
