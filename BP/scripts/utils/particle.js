import { MolangVariableMap } from "@minecraft/server"
import { Vector } from "./vector"

export class Particle {
    /**
     * @param {Vector} start
     * @param {Vector} end
     * @param {import("@minecraft/server").Dimension} dimension
     * @param {number} width
     */
    static line(particle, start, end, dimension, lifetime = 0.11, width = 0.05) {
        const diff = Vector.subtract(start, end)
        const middle = Vector.divide(diff, 2).add(end)
        const direction = Vector.normalize(diff)
        const length = Math.hypot(diff.x / 2, diff.y / 2, diff.z / 2)
        const molang = new MolangVariableMap()

        molang.setFloat("dir_x", direction.x)
        molang.setFloat("dir_y", direction.y)
        molang.setFloat("dir_z", direction.z)
        molang.setFloat("width", width)
        molang.setFloat("length", length)
        molang.setFloat("lifetime", lifetime)

        dimension.spawnParticle(particle, middle, molang)
    }

    /**
     * @param {Vector} start
     * @param {Vector} end
     * @param {import("@minecraft/server").Dimension} dimension
     * @param {number} width
     */
    static boxEdges(particle, location, size, dimension, lifetime = 0.11, width = 0.05) {
        const line = (start, offset) => {
            start.add(location)
            offset.add(start)
            this.line(particle, start, offset, dimension, lifetime, width)
        }

        line(new Vector(0, 0, 0), new Vector(0, size.y, 0))
        line(new Vector(size.x, 0, 0), new Vector(0, size.y, 0))
        line(new Vector(0, 0, size.z), new Vector(0, size.y, 0))
        line(new Vector(size.x, 0, size.z), new Vector(0, size.y, 0))

        line(new Vector(0, 0, 0), new Vector(0, 0, size.z))
        line(new Vector(size.x, 0, 0), new Vector(0, 0, size.z))
        line(new Vector(0, size.y, 0), new Vector(0, 0, size.z))
        line(new Vector(size.x, size.y, 0), new Vector(0, 0, size.z))

        line(new Vector(0, 0, 0), new Vector(size.x, 0, 0))
        line(new Vector(0, size.y, 0), new Vector(size.x, 0, 0))
        line(new Vector(0, 0, size.z), new Vector(size.x, 0, 0))
        line(new Vector(0, size.y, size.z), new Vector(size.x, 0, 0))
    }
}
