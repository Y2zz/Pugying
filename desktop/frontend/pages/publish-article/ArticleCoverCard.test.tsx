// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { ArticleCoverCard } from "./ArticleCoverCard";
import { emptyCoverPair } from "./helpers";

afterEach(cleanup);

it("marks the missing required cover and connects it to the inline error", () => {
  const props = {
    needs: [
      { aspect: "portrait" as const, required: true, platformLabels: ["抖音"] },
      {
        aspect: "landscape" as const,
        required: false,
        platformLabels: ["抖音"],
      },
    ],
    covers: emptyCoverPair(),
    hasAccounts: true,
    canUseFirstImage: false,
    onEdit: vi.fn(),
    onUseFirstImage: vi.fn(),
  };
  const view = render(<ArticleCoverCard {...props} />);
  const required = screen.getByRole("button", { name: "设置竖版 3:4封面" });
  expect(required.getAttribute("aria-invalid")).toBeNull();
  view.rerender(<ArticleCoverCard {...props} invalidAspects={["portrait"]} />);
  expect(required.getAttribute("aria-invalid")).toBe("true");
  expect(required.className).toContain("border-destructive");
  const error = screen.getByText("请设置竖版 3:4封面");
  expect(required.getAttribute("aria-describedby")).toBe(error.id);
  expect(
    screen
      .getByRole("button", { name: "设置横版 4:3封面" })
      .getAttribute("aria-invalid"),
  ).toBeNull();
  view.rerender(<ArticleCoverCard {...props} invalidAspects={[]} />);
  expect(required.getAttribute("aria-invalid")).toBeNull();
  expect(screen.queryByText("请设置竖版 3:4封面")).toBeNull();
});
