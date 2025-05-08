export const delay = async (sec: number) => {
  return new Promise((resolve) => setTimeout(resolve, sec * 1000));
};
