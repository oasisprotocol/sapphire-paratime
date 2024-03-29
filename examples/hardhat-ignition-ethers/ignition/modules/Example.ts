import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("Example", (m) => {
    const example = m.contract("Example", []);

    m.call(example, 'doNothing', []);

    return {
        example
    };
});
