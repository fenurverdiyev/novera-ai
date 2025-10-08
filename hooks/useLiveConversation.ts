export type LiveConversationControls = {
  start: () => void;
  stop: () => void;
};

export function useLiveConversation(): LiveConversationControls {
  const start = () => {
    // TODO: paste mic/camera start logic here
  };
  const stop = () => {
    // TODO: paste mic/camera stop logic here
  };
  return { start, stop };
}
