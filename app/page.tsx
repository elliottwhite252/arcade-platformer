import Game from "./components/Game";

export default function Home() {
  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-gray-950 min-h-screen py-8">
      <Game />
    </div>
  );
}
