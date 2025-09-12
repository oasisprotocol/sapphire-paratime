import { useConnect, useConnectors } from 'wagmi';

export const WagmiConnectors = () => {
  const { connect } = useConnect();
  const connectors = useConnectors();

  return (
    <>
      {connectors.map((connector) => (
        <button
          key={connector.id}
          onClick={() => connect({ connector })}
          type="button"
          data-testid={connector.id}
        >
          {connector.name}
        </button>
      ))}
    </>
  );
};