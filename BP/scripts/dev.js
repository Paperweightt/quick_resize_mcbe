import { world, system } from "@minecraft/server"
import { PARTICLE_GROUP, TYPE_IDS } from "./constants.js"
import { spawnParticleBox } from "./editInstance.js"
import { Vector } from "./utils/vector.js"
import { Particle } from "./utils/particle.js"

const dev = false

if (dev) {
    const wait = 2

    system.run(() => {
        system.runInterval(async () => {
            const dimension = world.getDimension("overworld")
            const location = new Vector(5, -63, -8)
            const size = new Vector(1, 5, 8)
            const color = { red: 1, green: 1, blue: 1 }

            spawnParticleBox(dimension, location, size, PARTICLE_GROUP.EDIT, color)
        }, wait * 2)
    })

    system.run(() => {
        system.runInterval(async () => {
            const dimension = world.getDimension("overworld")
            const location = new Vector(5, -63, -8)
            const size = new Vector(1, 5, 8)

            Particle.boxEdges(TYPE_IDS.PARTICLE, location, size, dimension, 0.1)
        }, wait)
    })
}
