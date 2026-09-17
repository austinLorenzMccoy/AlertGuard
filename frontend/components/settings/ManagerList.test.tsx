import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ManagerList } from "@/components/settings/ManagerList";

describe("ManagerList", () => {
  it("shows an empty state with no managers", () => {
    render(<ManagerList initialManagers={[]} />);
    expect(screen.getByText("No managers yet.")).toBeInTheDocument();
  });

  it("lists initial managers", () => {
    render(<ManagerList initialManagers={[{ id: "m1", email: "a@b.com" }]} />);
    expect(screen.getByText("a@b.com")).toBeInTheDocument();
  });

  it("shows an error and does not add an invalid email", async () => {
    render(<ManagerList initialManagers={[]} />);
    await userEvent.type(screen.getByLabelText("Invite manager"), "not-an-email");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a valid email address.");
    expect(screen.getByText("No managers yet.")).toBeInTheDocument();
  });

  it("adds a manager and clears the input for a valid email", async () => {
    render(<ManagerList initialManagers={[]} />);
    await userEvent.type(screen.getByLabelText("Invite manager"), "new@fleet.com");
    await userEvent.click(screen.getByRole("button", { name: "Send invite" }));
    expect(screen.getByText("new@fleet.com")).toBeInTheDocument();
    expect(screen.getByLabelText("Invite manager")).toHaveValue("");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
