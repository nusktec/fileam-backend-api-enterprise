import process from "process";

export const RandomAscii = (length: number) => {
  let charArray = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  let code = [];

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charArray.length);
    code.push(charArray[randomIndex]);
  }

  return code.join("");
};

export const PrintDebug = (e: any) => {
  if (process.env.DEBUG) {
    console.log(e);
  }
};
